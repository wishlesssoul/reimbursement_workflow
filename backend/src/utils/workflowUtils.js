export function isValidRequestVersion(version) {
  const hasValue = typeof version === 'number' || (typeof version === 'string' && version.trim() !== '');
  return hasValue && Number.isInteger(Number(version)) && Number(version) >= 0;
}