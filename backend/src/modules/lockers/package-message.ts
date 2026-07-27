interface PackageRef {
  externalTracking?: string | null;
  description?: string | null;
  merchant?: string | null;
}

export function packageReceivedMessage(
  lockerCode: string,
  pkg: PackageRef,
): string {
  const ref =
    pkg.description ?? pkg.merchant ?? pkg.externalTracking ?? 'tu paquete';
  return `Recibimos ${ref} en nuestra bodega de USA (casillero ${lockerCode}). Pronto lo consolidaremos para su envío.`;
}
