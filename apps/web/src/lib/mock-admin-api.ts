export type FeatureFlag = {
  id: string
  name: string
  description: string
  enabled: boolean
  targeting: string
  updatedAt: string
  critical?: boolean
}

export type WebhookDelivery = {
  id: string
  statusCode: number
  timestamp: string
  retryCount: number
}

export type WebhookRow = {
  id: string
  url: string
  events: string[]
  active: boolean
  lastTriggeredAt: string | null
  successRate: number
  deliveries: WebhookDelivery[]
}

// Expected backend API shape (placeholder):
// features.list -> { id, name, description, enabled, targeting, updatedAt }[]
// features.update -> { id, enabled }
// webhooks.list -> { id, url, events, active, lastTriggeredAt, successRate }[]
// webhooks.create -> { url, events, secret }
// webhooks.delete -> { id }

let featureFlags: FeatureFlag[] = [
  {
    id: 'ff-rollouts',
    name: 'canary-rollouts',
    description: 'Progressive deployment rollout controls',
    enabled: true,
    targeting: 'clusters: production-*',
    updatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    critical: true,
  },
  {
    id: 'ff-alert-routing',
    name: 'intelligent-alert-routing',
    description: 'Routes alerts by team ownership and severity',
    enabled: true,
    targeting: 'roles: oncall, sre',
    updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: 'ff-ai-summary',
    name: 'ai-incident-summary',
    description: 'Generates post-incident summary from event timeline',
    enabled: false,
    targeting: 'beta users only',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
]

let webhooks: WebhookRow[] = [
  {
    id: 'wh-1',
    url: 'https://hooks.slack.com/services/T000/B000/XXXX',
    events: ['cluster.health.changed', 'alert.triggered'],
    active: true,
    lastTriggeredAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    successRate: 98,
    deliveries: [
      { id: 'd-1', statusCode: 200, timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(), retryCount: 0 },
      { id: 'd-2', statusCode: 200, timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), retryCount: 0 },
      { id: 'd-3', statusCode: 500, timestamp: new Date(Date.now() - 1000 * 60 * 88).toISOString(), retryCount: 2 },
    ],
  },
  {
    id: 'wh-2',
    url: 'https://example.internal/webhooks/voyager',
    events: ['deployment.restarted', 'user.created'],
    active: false,
    lastTriggeredAt: new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString(),
    successRate: 84,
    deliveries: [
      { id: 'd-4', statusCode: 202, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString(), retryCount: 0 },
      { id: 'd-5', statusCode: 429, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(), retryCount: 3 },
    ],
  },
]

const sleep = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockAdminApi = {
  features: {
    async list() {
      await sleep(350)
      return featureFlags.map(({ critical: _critical, ...item }) => item)
    },
    async update(input: { id: string; enabled: boolean }) {
      await sleep(250)
      featureFlags = featureFlags.map((f) => (f.id === input.id ? { ...f, enabled: input.enabled, updatedAt: new Date().toISOString() } : f))
      return input
    },
    async listWithMeta() {
      await sleep(250)
      return featureFlags
    },
  },
  webhooks: {
    async list() {
      await sleep(350)
      return webhooks.map(({ deliveries: _deliveries, ...item }) => item)
    },
    async listWithDeliveries() {
      await sleep(300)
      return webhooks
    },
    async create(input: { url: string; events: string[]; secret: string; active?: boolean }) {
      await sleep(250)
      const item: WebhookRow = {
        id: `wh-${Date.now()}`,
        url: input.url,
        events: input.events,
        active: input.active ?? true,
        lastTriggeredAt: null,
        successRate: 100,
        deliveries: [],
      }
      webhooks = [item, ...webhooks]
      return { url: input.url, events: input.events, secret: input.secret }
    },
    async delete(input: { id: string }) {
      await sleep(220)
      webhooks = webhooks.filter((item) => item.id !== input.id)
      return input
    },
  },
}
