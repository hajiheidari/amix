//+------------------------------------------------------------------+
//| AmixExport.mq5                                                    |
//| Exports contract specifications of Market Watch symbols to JSON   |
//| for import into Amix (Instruments → Import from MetaTrader).      |
//| Read-only: it does not trade, change settings or send data online.|
//+------------------------------------------------------------------+
#property copyright "Amix"
#property version   "1.00"
#property description "Export symbol specifications for Amix (read-only)"
#property script_show_inputs

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
   string t = TimeToString(TimeGMT(), TIME_DATE | TIME_SECONDS); // 2026.10.15 08:00:00
   StringReplace(t, ".", "-");
   StringReplace(t, " ", "T");
   return t + "Z";
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
   FileWriteString(h, "\"format\":\"amix-mt-symbols\",\"version\":1,\"platform\":\"MT5\",\n");
   FileWriteString(h, "\"exportedAt\":" + Q(IsoNow()) + ",\n");
   FileWriteString(h, "\"account\":{\"company\":" + Q(AccountInfoString(ACCOUNT_COMPANY)) +
                      ",\"server\":" + Q(AccountInfoString(ACCOUNT_SERVER)) +
                      ",\"currency\":" + Q(AccountInfoString(ACCOUNT_CURRENCY)) +
                      ",\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "},\n");
   FileWriteString(h, "\"symbols\":[\n");
   int written = 0;
   for(int i = 0; i < total; i++)
     {
      string name = SymbolName(i, selectedOnly);
      if(name == "")
         continue;
      ENUM_SYMBOL_CALC_MODE mode = (ENUM_SYMBOL_CALC_MODE)SymbolInfoInteger(name, SYMBOL_TRADE_CALC_MODE);
      double initRate = 0, maintRate = 0;
      if(!SymbolInfoMarginRate(name, ORDER_TYPE_BUY, initRate, maintRate))
         initRate = 0;
      long tradeMode = SymbolInfoInteger(name, SYMBOL_TRADE_MODE);
      string rec = "{";
      rec += "\"name\":" + Q(name);
      rec += ",\"description\":" + Q(SymbolInfoString(name, SYMBOL_DESCRIPTION));
      rec += ",\"path\":" + Q(SymbolInfoString(name, SYMBOL_PATH));
      rec += ",\"digits\":" + IntegerToString(SymbolInfoInteger(name, SYMBOL_DIGITS));
      rec += ",\"point\":" + N(SymbolInfoDouble(name, SYMBOL_POINT));
      rec += ",\"contractSize\":" + N(SymbolInfoDouble(name, SYMBOL_TRADE_CONTRACT_SIZE));
      rec += ",\"tickSize\":" + N(SymbolInfoDouble(name, SYMBOL_TRADE_TICK_SIZE));
      rec += ",\"tickValue\":" + N(SymbolInfoDouble(name, SYMBOL_TRADE_TICK_VALUE));
      rec += ",\"volumeMin\":" + N(SymbolInfoDouble(name, SYMBOL_VOLUME_MIN));
      rec += ",\"volumeMax\":" + N(SymbolInfoDouble(name, SYMBOL_VOLUME_MAX));
      rec += ",\"volumeStep\":" + N(SymbolInfoDouble(name, SYMBOL_VOLUME_STEP));
      rec += ",\"baseCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_BASE));
      rec += ",\"profitCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_PROFIT));
      rec += ",\"marginCurrency\":" + Q(SymbolInfoString(name, SYMBOL_CURRENCY_MARGIN));
      rec += ",\"calcMode\":" + Q(EnumToString(mode));
      rec += ",\"marginInitial\":" + N(SymbolInfoDouble(name, SYMBOL_MARGIN_INITIAL));
      rec += ",\"marginRate\":" + N(initRate);
      rec += ",\"tradeAllowed\":" + (tradeMode == SYMBOL_TRADE_MODE_DISABLED ? "false" : "true");
      rec += "}";
      FileWriteString(h, (written > 0 ? ",\n" : "") + rec);
      written++;
     }
   FileWriteString(h, "\n]}\n");
   FileClose(h);
   string path = TerminalInfoString(TERMINAL_DATA_PATH) + "\\MQL5\\Files\\" + fname;
   Alert("Amix export: ", written, " symbols written to ", path);
  }
//+------------------------------------------------------------------+
