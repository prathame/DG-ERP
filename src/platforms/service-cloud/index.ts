export {
  isServiceCloudClient,
  isServiceCloudDesktop,
  isServiceCloudMobile,
  serviceCloudClientHeader,
  serviceCloudClientKind,
} from './mode';
export { getOrCreateCloudDeviceId } from './deviceId';
export { claimAndAcquire, heartbeatSession, releaseSession, type GateState, type SessionHolder } from './session';
export { ServiceCloudGate } from './ServiceCloudGate';
