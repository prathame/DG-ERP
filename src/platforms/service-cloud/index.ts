export {
  isServiceCloudClient,
  isServiceCloudDesktop,
  isServiceCloudMobile,
  isServiceCloudBrowser,
  isServicePhoneUx,
  isServiceProductUx,
  serviceCloudClientHeader,
  serviceCloudClientKind,
} from './mode';
export { getOrCreateCloudDeviceId } from './deviceId';
export { claimAndAcquire, heartbeatSession, releaseSession, type GateState, type SessionHolder } from './session';
export { ServiceCloudGate } from './ServiceCloudGate';
export { ServiceCloudLiveBadge, ServiceCloudConfigRefresh } from './ServiceCloudLiveBadge';
