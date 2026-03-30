/** Shared K8s unit parsers — used by metrics router and watch-manager */

export function parseCpuToNano(cpu: string): number {
  if (cpu.endsWith('n')) return Number.parseInt(cpu, 10)
  if (cpu.endsWith('u')) return Number.parseInt(cpu, 10) * 1000
  if (cpu.endsWith('m')) return Number.parseInt(cpu, 10) * 1e6
  return Number.parseFloat(cpu) * 1e9
}

export function parseMemToBytes(mem: string): number {
  if (mem.endsWith('Ki')) return Number.parseInt(mem, 10) * 1024
  if (mem.endsWith('Mi')) return Number.parseInt(mem, 10) * 1024 * 1024
  if (mem.endsWith('Gi')) return Number.parseInt(mem, 10) * 1024 * 1024 * 1024
  return Number.parseInt(mem, 10)
}
