export class Error{
  constructor(public rangeMin:number,public rangeLen:number){

  }
  length(){
    return this.rangeLen
  }
}
export class LanguageLexerError extends Error{
}
