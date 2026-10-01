import { parseStencil, type Stencil } from '../format'
import { parseTemplate, type Template } from '../templates'
import aiGatewayStencil from './stencils/ai-gateway.json'
import apiGatewayStencil from './stencils/api-gateway.json'
import decisionStencil from './stencils/decision.json'
import loadBalancerStencil from './stencils/load-balancer.json'
import queueStencil from './stencils/queue.json'
import readReplicaStencil from './stencils/read-replica.json'
import trustZoneStencil from './stencils/trust-zone.json'
import userWebAppStencil from './stencils/user-web-app.json'
import ciCdTemplate from './templates/ci-cd.json'
import dataPipelineTemplate from './templates/data-pipeline.json'
import eventDrivenTemplate from './templates/event-driven.json'
import microservicesTemplate from './templates/microservices.json'
import networkZonesTemplate from './templates/network-zones.json'
import swimlaneTemplate from './templates/swimlane.json'
import threeTierTemplate from './templates/three-tier.json'

/*
 * Built-in content, kept as JSON data files. Read-only: "Duplicate to my library"
 * makes an editable copy. Parsed through the normal stencil and diagram
 * migrations, so older files keep loading.
 */

/** Raw files, exactly as stored (tests check each one). */
export const builtinStencilFiles: Record<string, unknown> = {
  'ai-gateway': aiGatewayStencil,
  'api-gateway': apiGatewayStencil,
  'decision': decisionStencil,
  'load-balancer': loadBalancerStencil,
  'queue': queueStencil,
  'read-replica': readReplicaStencil,
  'trust-zone': trustZoneStencil,
  'user-web-app': userWebAppStencil,
}

export const templateFiles: Record<string, unknown> = {
  'ci-cd': ciCdTemplate,
  'data-pipeline': dataPipelineTemplate,
  'event-driven': eventDrivenTemplate,
  'microservices': microservicesTemplate,
  'network-zones': networkZonesTemplate,
  'swimlane': swimlaneTemplate,
  'three-tier': threeTierTemplate,
}

export const BUILTIN_STENCILS: readonly Stencil[] = Object.values(builtinStencilFiles).map(parseStencil)
export const TEMPLATES: readonly Template[] = Object.values(templateFiles).map(parseTemplate)

export const isBuiltinId = (id: string) => id.startsWith('builtin:')
