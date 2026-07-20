import { Error as LanguageError, LanguageSyntaxError } from "./error";

const operators=["+","-","*","/","%","=","+=","-=","*=","/=","%=","&&=","||=","==","!=","<","<=",">",">=","&&","||","!","++","--",".",",",";","?",":","(",")","{","}","[","]"]
const operatorFirsts=Array.from(new Set(operators.map(e=>e[0]))).join("")

enum TokenType {
  number,
  string,
  textComponent,
  identifier,
  symbol,
}

export class Token {
  constructor(
    public value: string,
    public type: TokenType,
    public rangeMin: number,
  ) {}
  length() {
    return this.value.length;
  }
}
export class Lexer {
  read: number = 0;
  constructor(public text: string) {}
  forwardNumber(): undefined | Token | LanguageError {
    let str = "";
    let i = this.read;
    let forwardChar = () => {
      return this.text[i++];
    };
    let forwardNumStr = () => {
      while ("0123456789".includes(this.text[i])) {
        str += forwardChar();
      }
      if (str.length == 0) {
        return false;
      }
      return true;
    };
    forwardNumStr();
    if (str == "0" && "xob".includes(this.text[i])) {
      forwardChar();
      while ("0123456789abcdef".includes(this.text[i])) {
        str += forwardChar();
      }
      if (str.length == 0) {
        return new LanguageSyntaxError(this.read, str.length);
      }
    } else {
      if (this.text[i] == ".") {
        forwardChar();
        if (!forwardNumStr()) {
          return new LanguageSyntaxError(this.read, str.length);
        }
      }
      if (this.text[i] == "e") {
        forwardChar();
        if ("+-".includes(this.text[i])) {
          return new LanguageSyntaxError(this.read, str.length);
        }
        forwardNumStr();
      }
    }
    return new Token(str, TokenType.number, this.read);
  }
  forwardString(): undefined | Token | LanguageError {
    let i=this.read;
    if("\"'".includes(this.text[i])){
      
    }
  }
  lexing(): Token[] {
    let tokens = [];
    while (true) {
      let token = this.forwardNumber();
      let token2 = this.forwardNumber();
      if (token2 && (!token || token.length() < token2.length())) {
        token = token2;
      }
      tokens.push();
    }

    return [];
  }
}
