export interface ProofViewPort {readonly management:boolean;configured():unknown;snapshot(id:string):Promise<any>;readUrl(id:string):Promise<string>;demoSnapshot(id:string):any}
