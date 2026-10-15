"""
Weekly broker catalog exporter (runs on a GitHub-hosted Windows runner).

Logs into each configured MetaTrader 5 DEMO account, reads the contract
specifications of all tradeable symbols and writes them in the same
`amix-mt-symbols` format the app already imports, plus an index file.

Input: environment variable MT_ACCOUNTS (a GitHub secret), a JSON list:
  [{"id": "exness-standard", "broker": "Exness", "accountType": "Standard",
    "server": "Exness-MT5Trial", "login": 12345678, "password": "..."}]
Credentials are never printed. Without MT_ACCOUNTS the script only probes
that the terminal can be started (feasibility check).
"""
import datetime as dt
import json
import multiprocessing as mp
import os
import subprocess
import sys
import time

import MetaTrader5 as mt5

TERMINAL = os.environ.get("MT5_PATH", r"C:\Program Files\MetaTrader 5\terminal64.exe")
ACCOUNT_TIMEOUT_S = int(os.environ.get("ACCOUNT_TIMEOUT_S", "420"))
OUT = os.environ.get("CATALOG_DIR", "catalog")
CALC_NAMES = {getattr(mt5, n): n for n in dir(mt5) if n.startswith("SYMBOL_CALC_MODE_")}


def iso_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def init(account=None) -> bool:
    kwargs = {"path": TERMINAL, "timeout": 120_000, "portable": False}
    if account:
        kwargs.update(login=int(account["login"]), password=str(account["password"]), server=str(account["server"]))
    for attempt in range(3):
        if mt5.initialize(**kwargs):
            return True
        code, msg = mt5.last_error()
        print(f"  initialize attempt {attempt + 1} failed: {code} {msg}")
        mt5.shutdown()
        time.sleep(10)
    return False


def effective_margin(info, tick):
    """Margin and notional for 1 lot in ACCOUNT currency, measured by the terminal itself."""
    price = tick.ask if tick and tick.ask > 0 else (info.ask or info.bid or 0)
    if price <= 0:
        return None, None
    margin = mt5.order_calc_margin(mt5.ORDER_TYPE_BUY, info.name, 1.0, price)
    notional = None
    if info.trade_tick_size > 0 and info.trade_tick_value > 0:
        # tick value (account ccy) / tick size = value of a 1.00 move for 1 lot → × price = notional
        notional = price * info.trade_tick_value / info.trade_tick_size
    return (margin if margin and margin > 0 else None), notional


def export_account(acc) -> dict:
    a = mt5.account_info()
    total = mt5.symbols_total()
    symbols = mt5.symbols_get() or ()
    out = []
    for s in symbols:
        if s.trade_mode == mt5.SYMBOL_TRADE_MODE_DISABLED:
            continue
        mt5.symbol_select(s.name, True)
        info = mt5.symbol_info(s.name) or s
        tick = mt5.symbol_info_tick(s.name)
        margin, notional = effective_margin(info, tick)
        out.append({
            "name": info.name,
            "description": info.description,
            "path": info.path,
            "digits": info.digits,
            "point": info.point,
            "contractSize": info.trade_contract_size,
            "tickSize": info.trade_tick_size,
            "tickValue": info.trade_tick_value,
            "volumeMin": info.volume_min,
            "volumeMax": info.volume_max,
            "volumeStep": info.volume_step,
            "baseCurrency": info.currency_base,
            "profitCurrency": info.currency_profit,
            "marginCurrency": info.currency_margin,
            "calcMode": CALC_NAMES.get(info.trade_calc_mode, f"UNKNOWN_{info.trade_calc_mode}"),
            "marginInitial": info.margin_initial,
            "marginRate": 0,
            "marginPerLotAccount": margin,
            "notionalPerLotAccount": notional,
            "tradeAllowed": info.trade_mode != mt5.SYMBOL_TRADE_MODE_DISABLED,
        })
    print(f"  {acc['id']}: {len(out)} tradeable symbols (of {total})")
    return {
        "format": "amix-mt-symbols",
        "version": 1,
        "platform": "MT5",
        "exportedAt": iso_now(),
        "account": {
            "company": a.company if a else acc["broker"],
            "server": acc["server"],
            "currency": a.currency if a else "",
            "leverage": a.leverage if a else 0,
        },
        "catalog": {"id": acc["id"], "broker": acc["broker"], "accountType": acc.get("accountType", ""), "source": "demo account"},
        "symbols": out,
    }


def _worker(acc, q):
    """Runs in a child process so a hung terminal can be killed."""
    try:
        if not init(acc):
            q.put({"error": f"login failed: {mt5.last_error()[0]}"})
            return
        data = export_account(acc)
        mt5.shutdown()
        q.put({"data": data})
    except Exception as e:  # noqa: BLE001
        q.put({"error": f"{type(e).__name__}"})


def kill_terminals():
    subprocess.run(["taskkill", "/F", "/IM", "terminal64.exe"], capture_output=True)


def run_account(acc):
    q = mp.Queue()
    p = mp.Process(target=_worker, args=(acc, q))
    p.start()
    p.join(ACCOUNT_TIMEOUT_S)
    if p.is_alive():
        p.kill()
        kill_terminals()
        return None, f"timed out after {ACCOUNT_TIMEOUT_S}s"
    kill_terminals()
    try:
        r = q.get_nowait()
    except Exception:  # noqa: BLE001
        return None, "no result"
    return r.get("data"), r.get("error")


def probe() -> int:
    """Without accounts: check that the installed terminal starts and stays up."""
    proc = subprocess.Popen([TERMINAL, "/portable"])
    time.sleep(25)
    alive = proc.poll() is None
    kill_terminals()
    print(f"PROBE {'OK' if alive else 'FAILED'}: terminal process {'started and stayed up' if alive else 'exited'}; "
          f"python package {mt5.__version__}. Login/export needs MT_ACCOUNTS.")
    return 0 if alive else 1


def main() -> int:
    raw = os.environ.get("MT_ACCOUNTS", "").strip()
    if not raw:
        print("MT_ACCOUNTS not set: probe mode")
        return probe()
    try:
        accounts = json.loads(raw)
    except json.JSONDecodeError:
        print("MT_ACCOUNTS is not valid JSON (content not shown)")
        return 1
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, "index.json")
    index = {"format": "amix-broker-catalog", "version": 1, "updatedAt": iso_now(), "entries": []}
    if os.path.exists(index_path):
        try:
            old = json.load(open(index_path, encoding="utf-8"))
            index["entries"] = old.get("entries", [])
        except Exception:
            pass
    failures = 0
    for acc in accounts:
        for k in ("id", "broker", "server", "login", "password"):
            if k not in acc:
                print(f"account entry missing '{k}' (skipped)")
                failures += 1
                break
        else:
            print(f"exporting {acc['id']} ({acc['broker']} {acc.get('accountType', '')}, {acc['server']})")
            data, error = run_account(acc)
            if error or not data:
                print(f"  {acc['id']}: FAILED ({error})")
                failures += 1
                continue
            if not data["symbols"]:
                print(f"  {acc['id']}: no symbols, not written")
                failures += 1
                continue
            fname = f"{acc['id']}.json"
            with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
            entry = {"id": acc["id"], "broker": acc["broker"], "accountType": acc.get("accountType", ""), "server": acc["server"],
                     "platform": "MT5", "file": fname, "exportedAt": data["exportedAt"], "symbolCount": len(data["symbols"]),
                     "accountCurrency": data["account"]["currency"], "leverage": data["account"]["leverage"]}
            index["entries"] = [e for e in index["entries"] if e.get("id") != acc["id"]] + [entry]
    index["entries"].sort(key=lambda e: (e["broker"], e.get("accountType", "")))
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print(f"done: {len(index['entries'])} catalog entries, {failures} failures")
    return 1 if failures and not index["entries"] else 0


if __name__ == "__main__":
    mp.freeze_support()
    sys.exit(main())
