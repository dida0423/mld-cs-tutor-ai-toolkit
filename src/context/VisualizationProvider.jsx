import { useMemo, useState } from 'react'
import { VisualizationContext } from './visualizationContext.js'

/**
 * Holds live visualization state for the AI tutor. Each topic module publishes
 * snapshots; switching tabs unmounts the previous module, whose cleanup clears payload.
 */
export function VisualizationProvider({ activeTopic, children }) {
  const [vizPayload, setVizPayload] = useState(null)

  const value = useMemo(
    () => ({
      activeTopic,
      vizPayload,
      setVizPayload,
    }),
    [activeTopic, vizPayload]
  )

  return <VisualizationContext.Provider value={value}>{children}</VisualizationContext.Provider>
}
