export class Error{
  constructor(public rangeMin:number,public rangeLen:number,public message:string){

  }
  length(){
    return this.rangeLen
  }
}
export class LanguageLexerError extends Error{
}
