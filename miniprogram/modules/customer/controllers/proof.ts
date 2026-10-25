import { createProofViewer } from '../../features/proof/viewer'
import { getCloudContext } from '../../shared/runtime/context'
import { proofSnapshot,proofUrl } from '../api/proof'
import { loadWorkflowOrders } from '../demo/orders'
export function createCustomerProofController(){
 const viewer=createProofViewer({management:false,configured:getCloudContext,snapshot:proofSnapshot,readUrl:proofUrl,demoSnapshot(id){return loadWorkflowOrders().find(o=>o.id===id)}})
 return {...viewer}
}
