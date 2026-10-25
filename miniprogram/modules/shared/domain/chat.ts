export interface ChatMessage {id:string;seq:string;sender:'customer'|'merchant';content:string;createdAt:string|number}
export interface ChatPort {
 readonly sender:'customer'|'merchant'
 bind(options:Record<string,string|undefined>):string
 configured():unknown
 identity():string
 login():Promise<void>
 get(action:'messages'|'unread',query?:Record<string,string|number>):Promise<any>
 post(action:'messages'|'read',body:Record<string,string>):Promise<any>
 demoMessages():Array<any>
 sendDemo(content:string):boolean
}
