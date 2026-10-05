import { handlePersonaRequest } from './personaApi.ts'

export default {
  async fetch(request: Request, env: Pick<Cloudflare.LocalEnv, 'PERSONAS_DB' | 'PERSONA_DATASET_VERSION'>) {
    return await handlePersonaRequest(request, { database: env.PERSONAS_DB, datasetVersion: env.PERSONA_DATASET_VERSION }) ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Pick<Cloudflare.LocalEnv, 'PERSONAS_DB' | 'PERSONA_DATASET_VERSION'>>
