//+------------------------------------------------------------------+
//| AmixExport.mq4                                                    |
//| Exports contract specifications of Market Watch symbols to JSON   |
//| for import into Amix. Read-only: no trading, no network access.   |
//+------------------------------------------------------------------+
#property copyright "Amix"
#property version   "1.00"
#property description "Export symbol specifications for Amix (read-only)"
#property strict
#property show_inputs

input bool InpAllSymbols = false; // Export ALL server symbols (default: Market Watch only)

string JsonEscape(const string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"')       out += "\\\"";
      else if(c == '\\') out += "\\\\";
      else if(c == '\n') out += "\\n";
      else if(c == '\r') out += "\\r";
      else if(c == '\t') out += "\\t";
      else if(c < 32)    out += " ";
      else               out += ShortToString(c);
     }
   return out;
  }

string Q(const string s) { return "\"" + JsonEscape(s) + "\""; }
string N(const double v) { return DoubleToString(v, 10); }

string IsoNow()
  {
   string t = TimeToString(TimeGMT(), TIME_DATE | TIME_SECONDS);
   StringReplace(t, ".", "-");
   StringReplace(t, " ", "T");
   return t + "Z";
  }

// MT4 has no single calculation-mode enum; map profit/margin modes to the MT5 names Amix understands.
// Margin rates are not exposed by MT4 for CFDs, so they are exported as 0 ("unknown").
string CalcMode(const string name, double &rate)
  {
   int profitMode = (int)MarketInfo(name, MODE_PROFITCALCMODE); // 0 Forex, 1 CFD, 2 Futures
   int marginMode = (int)MarketInfo(name, MODE_MARGINCALCMODE); // 0 Forex, 1 CFD, 2 Futures, 3 CFD index
   if(profitMode == 2)
     { rate = 1; return "SYMBOL_CALC_MODE_FUTURES"; }
   if(marginMode == 3)
     { rate = 0; return "SYMBOL_CALC_MODE_CFDINDEX"; }
   if(profitMode == 0 && marginMode == 0)
     { rate = 1; return "SYMBOL_CALC_MODE_FOREX"; }
   rate = 0;
   return "SYMBOL_CALC_MODE_CFD";
  }

void OnStart()
  {
   bool selectedOnly = !InpAllSymbols;
   int total = SymbolsTotal(selectedOnly);
   string fname = "amix-symbols.json";
   int h = FileOpen(fname, FILE_WRITE | FILE_TXT | FILE_ANSI, '\t', CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      Alert("Amix export: cannot create file, error ", GetLastError());
      return;
     }
   FileWriteString(h, "{\n");
   FileWriteString(h, "\"format\":\"amix-mt-symbols\",\"version\":1,\"platform\":\"MT4\",\n");
   FileWriteString(h, "\"exportedAt\":" + Q(IsoNow()) + ",\n");
   FileWriteString(h, "\"account\":{\"company\":" + Q(AccountCompany()) +
                      ",\"server\":" + Q(AccountServer()) +
                      ",\"currency\":" + Q(AccountCurrency()) +
                      ",\"leverage\":" + IntegerToString(AccountLeverage()) + "},\n");
   FileWriteString(h, "\"symbols\":[\n");
   int written = 0;
   for(int i = 0; i < total; i++)
     {
      string name = SymbolName(i, selectedOnly);
      if(name == "")
         continue;
      double rate = 0;
      string mode = CalcMode(name, rate);
      string rec = "{";
      rec += "\"name\":" + Q(name);
      rec += ",\"description\":" + Q(SymbolInfoString(name, SYMBOL_DESCRIPTION));
      rec += ",\"path\":" + Q(SymbolInfoString(name, SYMBOL_PATH));
      rec += ",\"digits\":" + IntegerToString((int)MarketInfo(name, MODE_DIGITS));
      rec += ",\"point\":" + N(MarketInfo(name, MODE_POINT));
      rec += ",\"contractSize\":" + N(MarketInfo(name, MODE_LOTSIZE));
      rec += ",\"tickSize\":" + N(MarketInfo(name, MODE_TICKSIZE));
      rec += ",\"tickValue\":" + N(MarketInfo(name, MODE_TICKVALUE));
      rec += ",\"volumeMin\":" + N(MarketInfo(name, MODE_MINLOT));
      rec += ",\"volumeMax\":" + N(MarketInfo(name, MODE_MAXLOT));
      rec += ",\"volumeStep\":" + N(MarketInfo(name, MODE_LOTSTEP));
      rec += ",\"baseCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_BASE));
      rec += ",\"profitCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_PROFIT));
      rec += ",\"marginCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_MARGIN));
      rec += ",\"calcMode\":" + Q(mode);
      rec += ",\"marginInitial\":" + N(MarketInfo(name, MODE_MARGININIT));
      rec += ",\"marginRate\":" + N(rate);
      rec += ",\"tradeAllowed\":" + (MarketInfo(name, MODE_TRADEALLOWED) != 0 ? "true" : "false");
      rec += "}";
      FileWriteString(h, (written > 0 ? ",\n" : "") + rec);
      written++;
     }
   FileWriteString(h, "\n]}\n");
   FileClose(h);
   string path = TerminalInfoString(TERMINAL_DATA_PATH) + "\\MQL4\\Files\\" + fname;
   Alert("Amix export: ", written, " symbols written to ", path);
  }
//+------------------------------------------------------------------+
