import { handlePersonaRequest } from '../tools/random-persona-generator/worker/personaApi.ts'

export default {
  async fetch(request: Request, env: Env) {
    return await handlePersonaRequest(request, { database: env.PERSONAS_DB, datasetVersion: env.PERSONA_DATASET_VERSION }) ?? env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
