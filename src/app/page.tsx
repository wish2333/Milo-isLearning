import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { ProductionHome } from '@/components/home/ProductionHome'
import { ShowcaseHome } from '@/components/home/ShowcaseHome'

export default function HomePage() {
  return isShowcaseMode ? <ShowcaseHome /> : <ProductionHome />
}
