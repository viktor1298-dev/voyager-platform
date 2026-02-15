import { redirect } from 'next/navigation'

export default function NewWebhookPage() {
  redirect('/webhooks?new=1')
}
