// Legacy mixed-role page adapter. Exclusive pages should use their role's API.
export { getCloudContext as supportConfig,cloudIdentity as supportIdentity } from '../modules/shared/runtime/context'
export * from '../modules/shared/domain/support'
export * from '../modules/shared/api/supportTransport'
