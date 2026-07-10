import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { ProductionSettings } from '@/components/settings/ProductionSettings'
import { ShowcaseSettings } from '@/components/settings/ShowcaseSettings'

export default function SettingsPage() {
  return isShowcaseMode ? <ShowcaseSettings /> : <ProductionSettings />
}
