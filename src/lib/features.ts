const PIXELS_BETA_USERS: number[] = [1]; // srizzon dev_id

export function isPixelsEnabled(devId: number): boolean {
  return PIXELS_BETA_USERS.includes(devId);
}
