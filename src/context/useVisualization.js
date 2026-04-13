import { useContext, useEffect } from 'react'
import { VisualizationContext } from './visualizationContext.js'

export function useVisualizationReader() {
  const ctx = useContext(VisualizationContext)
  if (!ctx) {
    throw new Error('useVisualizationReader must be used within VisualizationProvider')
  }
  return ctx
}

/**
 * Topic modules call this with an explicit dependency list; payload clears on unmount.
 */
export function usePublishVisualization(buildPayload, deps) {
  const { setVizPayload } = useVisualizationReader()
  useEffect(() => {
    setVizPayload(buildPayload())
    return () => setVizPayload(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps array is provided by callers
  }, deps)
}
