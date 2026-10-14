import type { AnyNode, Cheerio } from 'cheerio'
import { absoluteUrl, isProbablePageImage, largestSrcset } from '../Urls'

/** Explicit original images precede responsive sizes, lazy URLs, then src. */
export function imageUrl(element: Cheerio<AnyNode>, pageUrl: string, chapterPage = false, allowDynamic = false): string {
  const candidates: string[] = []
  for (const attribute of ['data-full', 'data-original']) {
    candidates.push(absoluteUrl(element.attr(attribute), pageUrl))
  }
  for (const attribute of ['data-srcset', 'srcset']) {
    const srcset = element.attr(attribute)
    if (srcset) candidates.push(absoluteUrl(largestSrcset(srcset), pageUrl))
  }
  for (const attribute of ['data-src', 'data-lazy-src', 'data-url', 'data-cfsrc', 'src']) {
    candidates.push(absoluteUrl(element.attr(attribute), pageUrl))
  }
  return candidates.find(url => url && (chapterPage
    ? isProbablePageImage(url, allowDynamic)
    : !/(?:placeholder|blank\.gif|spacer\.gif|pixel\.gif)/i.test(url))) || ''
}
