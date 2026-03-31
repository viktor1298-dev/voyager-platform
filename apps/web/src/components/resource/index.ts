export { ResourcePageScaffold } from './ResourcePageScaffold'
export {
  ResourceLoadingSkeleton,
  TableLoadingSkeleton,
  SectionLoadingSkeleton,
} from './ResourceLoadingSkeleton'
export type { ResourcePageScaffoldProps } from './ResourcePageScaffold'
export { SearchFilterBar } from './SearchFilterBar'
export { NamespaceGroup } from './NamespaceGroup'
export { RelatedPodsList } from './RelatedPodsList'
export { RelatedResourceLink } from './RelatedResourceLink'
export { useResourceNavigation } from './CrossResourceNav'
// YamlViewer and ResourceDiff are heavy — import directly from their files:
//   import { YamlViewer } from '@/components/resource/YamlViewer'
//   import { ResourceDiff } from '@/components/resource/ResourceDiff'
export { ActionToolbar } from './ActionToolbar'
export type { ActionButton } from './ActionToolbar'
export { DeleteConfirmDialog } from './DeleteConfirmDialog'
export { RestartConfirmDialog } from './RestartConfirmDialog'
export { ScaleInput } from './ScaleInput'
export { PortForwardCopy } from './PortForwardCopy'
