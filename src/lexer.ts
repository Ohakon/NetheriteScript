import { Error as LanguageError, LanguageLexerError } from "./error";

const symbols = [
  "+", "-", "*", "/", "%", "=", "+=", "-=", "*=", "/=", "%=", "&&=", "||=",
  "==", "!=", "<", "<=", ">", ">=", "&&", "||", "!", "++", "--", ".", ",", ";", "?", ":", "(",
  ")", "{", "}", "[", "]"
];

const symbolChars = Array.from(new Set(symbols.flatMap(e => e.split("")))).join("");

export enum TokenType {
  number,
  string,
  textComponent,
  identifier,
  symbol,
  templateHead,
  templateMiddle,
  templateTail,
}

type EscapeResult = {
  value: string;
  next: number;
};

export class Token {
  constructor(
    public value: string,
    public type: TokenType,
    public rangeMin: number,
    public sourceLength: number = value.length,
  ) { }

  length() {
    return this.sourceLength;
  }

  get rangeMax() {
    return this.rangeMin + this.sourceLength;
  }
}

export class Lexer {
  read: number = 0;
  private templateExprDepthStack: number[] = [];

  constructor(public text: string) { }

  private isIdentStart(c: string | undefined): boolean {
    return !!c && /[A-Za-z_$]/.test(c);
  }

  private isIdentPart(c: string | undefined): boolean {
    return !!c && /[A-Za-z0-9_$]/.test(c);
  }

  private isWhitespace(c: string | undefined): boolean {
    return !!c && " \t\n\r\v\f".includes(c);
  }

  private isTextComponentKeyChar(c: string | undefined): boolean {
    return !!c && /[A-Za-z0-9_$-]/.test(c);
  }

  private skipTrivia(): undefined | LanguageError {
    while (this.read < this.text.length) {
      const c = this.text[this.read];

      if (this.isWhitespace(c)) {
        this.read++;
        continue;
      }

      // line comment
      if (c === "/" && this.text[this.read + 1] === "/") {
        this.read += 2;
        while (this.read < this.text.length && this.text[this.read] !== "\n") {
          this.read++;
        }
        continue;
      }

      // block comment
      if (c === "/" && this.text[this.read + 1] === "*") {
        const start = this.read;
        this.read += 2;
        let closed = false;

        while (this.read < this.text.length) {
          if (this.text[this.read] === "*" && this.text[this.read + 1] === "/") {
            this.read += 2;
            closed = true;
            break;
          }
          this.read++;
        }

        if (!closed) {
          return new LanguageLexerError(start, this.text.length - start);
        }

        continue;
      }

      break;
    }

    return undefined;
  }

  private readEscape(i: number): EscapeResult | LanguageError {
    const start = i;
    i++; // skip backslash

    const esc = this.text[i];
    if (esc === undefined) {
      return new LanguageLexerError(start, 1);
    }

    const simple: Record<string, string> = {
      "\\": "\\",
      '"': '"',
      "'": "'",
      "`": "`",
      "{": "{",
      "}": "}",
      n: "\n",
      b: "\b",
      t: "\t",
      r: "\r",
      a: "\x07",
      v: "\v",
      f: "\f",
    };

    if (Object.prototype.hasOwnProperty.call(simple, esc)) {
      return { value: simple[esc], next: i + 1 };
    }

    // \xHH, \uHHHH, \UHHHHHHHH
    if (esc === "U" || esc === "u" || esc === "x") {
      const len = esc === "U" ? 8 : esc === "u" ? 4 : 2;
      const hexStart = i + 1;
      const hex = this.text.substring(hexStart, hexStart + len);

      if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) {
        return new LanguageLexerError(hexStart, len);
      }

      const num = parseInt(hex, 16);
      if (num > 0x10ffff) {
        return new LanguageLexerError(hexStart, len);
      }

      return { value: String.fromCodePoint(num), next: hexStart + len };
    }

    // \o377 or \o{377}
    if (esc === "o" || esc === "O") {
      let j = i + 1;

      if (this.text[j] === "{") {
        j++;
        const octStart = j;
        let oct = "";

        while (j < this.text.length && "01234567".includes(this.text[j])) {
          oct += this.text[j];
          j++;
        }

        if (oct.length === 0 || this.text[j] !== "}") {
          return new LanguageLexerError(octStart, 1);
        }

        const num = parseInt(oct, 8);
        if (num > 0x10ffff) {
          return new LanguageLexerError(octStart, oct.length);
        }

        return { value: String.fromCodePoint(num), next: j + 1 };
      }

      const octStart = j;
      let oct = "";

      while (j < this.text.length && oct.length < 3 && "01234567".includes(this.text[j])) {
        oct += this.text[j];
        j++;
      }

      if (oct.length === 0) {
        return new LanguageLexerError(i, 1);
      }

      const num = parseInt(oct, 8);
      if (num > 0x10ffff) {
        return new LanguageLexerError(octStart, oct.length);
      }

      return { value: String.fromCodePoint(num), next: j };
    }

    // \0 .. \777
    if ("01234567".includes(esc)) {
      let j = i;
      let oct = "";

      while (j < this.text.length && oct.length < 3 && "01234567".includes(this.text[j])) {
        oct += this.text[j];
        j++;
      }

      const num = parseInt(oct, 8);

      // 必要なら 1 バイト制限にする
      // if (num > 255) return new LanguageLexerError(i, j - i);

      return { value: String.fromCodePoint(num), next: j };
    }

    return new LanguageLexerError(i, 1);
  }

  forwardNumber(): undefined | Token | LanguageError {
    const start = this.read;
    let i = start;
    let str = "";

    const current = () => this.text[i];

    const readDigits = (digits: string): boolean => {
      const before = i;
      while (i < this.text.length && digits.includes(this.text[i])) {
        str += this.text[i];
        i++;
      }
      return i > before;
    };

    if (!readDigits("0123456789")) {
      return undefined;
    }

    if (str === "0") {
      const prefix = current();

      if (prefix === "x" || prefix === "X") {
        str += current();
        i++;
        if (!readDigits("0123456789abcdefABCDEF")) {
          return new LanguageLexerError(start, i - start);
        }
        return new Token(str, TokenType.number, start, i - start);
      }

      if (prefix === "o" || prefix === "O") {
        str += current();
        i++;
        if (!readDigits("01234567")) {
          return new LanguageLexerError(start, i - start);
        }
        return new Token(str, TokenType.number, start, i - start);
      }

      if (prefix === "b" || prefix === "B") {
        str += current();
        i++;
        if (!readDigits("01")) {
          return new LanguageLexerError(start, i - start);
        }
        return new Token(str, TokenType.number, start, i - start);
      }
    }

    if (current() === ".") {
      str += current();
      i++;

      if (!readDigits("0123456789")) {
        return new LanguageLexerError(start, i - start);
      }
    }

    if (current() === "e" || current() === "E") {
      str += current();
      i++;

      if (current() === "+" || current() === "-") {
        str += current();
        i++;
      }

      if (!readDigits("0123456789")) {
        return new LanguageLexerError(start, i - start);
      }
    }

    return new Token(str, TokenType.number, start, i - start);
  }

  forwardString(): undefined | Token | LanguageError {
    const start = this.read;
    const quote = this.text[start];

    if (quote !== '"' && quote !== "'") {
      return undefined;
    }

    let i = start + 1;
    let value = "";

    while (i < this.text.length && this.text[i] !== quote) {
      if (this.text[i] === "\\") {
        const res = this.readEscape(i);
        if (res instanceof LanguageError) return res;
        value += res.value;
        i = res.next;
      } else {
        value += this.text[i];
        i++;
      }
    }

    if (this.text[i] !== quote) {
      return new LanguageLexerError(start, i - start);
    }

    i++; // closing quote

    return new Token(value, TokenType.string, start, i - start);
  }

  forwardTextComponent(): undefined | Token | LanguageError {
    const start = this.read;

    if (this.text[start] !== "\\") {
      return undefined;
    }

    let i = start + 1;

    if (!this.isIdentStart(this.text[i])) {
      return new LanguageLexerError(start, 1);
    }

    let key = "";
    while (i < this.text.length && this.isTextComponentKeyChar(this.text[i])) {
      key += this.text[i];
      i++;
    }

    // \key だけを1トークンにする
    // value は別途普通にレキシングされる
    return new Token(key, TokenType.textComponent, start, i - start);
  }
  forwardTemplateText(): undefined | Token | LanguageError {
    const start = this.read;
    let i = start;
    let isContinuation = false;

    if (this.text[i] === "`") {
      // テンプレートリテラルの開始
      i++;
    } else if (this.text[i] === "}") {
      // 補間式の閉じ } からテンプレート本文へ戻る
      if (this.templateExprDepthStack.length === 0) {
        return new LanguageLexerError(start, 1);
      }
      isContinuation = true;
      i++;
    } else {
      return undefined;
    }

    let value = "";

    while (i < this.text.length) {
      const c = this.text[i];

      // テンプレート終了
      if (c === "`") {
        i++;

        if (isContinuation) {
          this.templateExprDepthStack.pop();
          return new Token(value, TokenType.templateTail, start, i - start);
        }

        // 補間がないテンプレートリテラル
        return new Token(value, TokenType.templateMiddle, start, i - start);
      }

      // エスケープ
      if (c === "\\") {
        const res = this.readEscape(i);
        if (res instanceof LanguageError) return res;
        value += res.value;
        i = res.next;
        continue;
      }

      // 補間開始
      if (c === "{") {
        i++;

        if (isContinuation) {
          // 既にテンプレート式の中にいるので、次の補間へ
          this.templateExprDepthStack[this.templateExprDepthStack.length - 1] = 0;
          return new Token(value, TokenType.templateMiddle, start, i - start);
        }

        // 最初の補間へ入る
        this.templateExprDepthStack.push(0);
        return new Token(value, TokenType.templateHead, start, i - start);
      }

      value += c;
      i++;
    }

    return new LanguageLexerError(start, i - start);
  }

  forwardIdentifier(): undefined | Token | LanguageError {
    const start = this.read;
    let i = start;

    if (!this.isIdentStart(this.text[i])) {
      return undefined;
    }

    let str = "";
    while (i < this.text.length && this.isIdentPart(this.text[i])) {
      str += this.text[i];
      i++;
    }

    return new Token(str, TokenType.identifier, start, i - start);
  }

  forwardSymbol(): undefined | Token | LanguageError {
    const start = this.read;
    const c = this.text[start];

    if (!c || !symbolChars.includes(c)) {
      return undefined;
    }

    const maxLen = Math.max(...symbols.map(op => op.length));

    for (let len = maxLen; len >= 1; len--) {
      const candidate = this.text.substring(start, start + len);
      if (symbols.includes(candidate)) {
        return new Token(candidate, TokenType.symbol, start, len);
      }
    }

    return new LanguageLexerError(start, 1);
  }
  lexing(): Token[] | LanguageError {
    const tokens: Token[] = [];

    while (true) {
      const triviaError = this.skipTrivia();
      if (triviaError) return triviaError;

      if (this.read >= this.text.length) {
        if (this.templateExprDepthStack.length > 0) {
          return new LanguageLexerError(this.text.length-1, 1);
        }
        return tokens;
      }

      const top =
        this.templateExprDepthStack.length > 0
          ? this.templateExprDepthStack[this.templateExprDepthStack.length - 1]
          : undefined;

      // テンプレート補間式の閉じ }
      if (top === 0 && this.text[this.read] === "}") {
        const token = this.forwardTemplateText();

        if (token instanceof LanguageError) return token;
        if (!token) return new LanguageLexerError(this.read, 1);

        tokens.push(token);
        this.read += token.length();
        continue;
      }

      // テンプレートリテラル開始
      if (this.text[this.read] === "`") {
        const token = this.forwardTemplateText();

        if (token instanceof LanguageError) return token;
        if (!token) return new LanguageLexerError(this.read, 1);

        tokens.push(token);
        this.read += token.length();
        continue;
      }

      const candidates: Array<Token | LanguageError | undefined> = [
        this.forwardNumber(),
        this.forwardString(),
        this.forwardTextComponent(),
        this.forwardIdentifier(),
        this.forwardSymbol(),
      ];

      for (const candidate of candidates) {
        if (candidate instanceof LanguageError) {
          return candidate;
        }
      }

      let best: Token | undefined = undefined;

      for (const candidate of candidates) {
        if (candidate instanceof Token) {
          if (!best || candidate.length() > best.length()) {
            best = candidate;
          }
        }
      }

      if (!best) {
        return new LanguageLexerError(this.read, 1);
      }

      // テンプレート補間式内の { } は深さを追跡する
      if (this.templateExprDepthStack.length > 0 && best.type === TokenType.symbol) {
        const index = this.templateExprDepthStack.length - 1;

        if (best.value === "{") {
          this.templateExprDepthStack[index]++;
        } else if (best.value === "}") {
          this.templateExprDepthStack[index]--;
        }
      }

      tokens.push(best);
      this.read += best.length();
    }
  }
}
