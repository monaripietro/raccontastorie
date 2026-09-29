import { hasModelInCache, deleteModelAllInfoInCache } from '@mlc-ai/web-llm'

export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    return await hasModelInCache(modelId)
  } catch {
    return false
  }
}

export async function deleteModelFromCache(modelId: string): Promise<boolean> {
  try {
    await deleteModelAllInfoInCache(modelId)
    return true
  } catch {
    return false
  }
}

export async function estimateCacheSize(): Promise<number> {
  try {
    let total = 0
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      total = estimate.usage ?? 0
    }
    return total
  } catch {
    return 0
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}
