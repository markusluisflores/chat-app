import type { OgMetadata } from '@/worker/processors/link-preview'

type Props = {
  meta: OgMetadata
}

export function LinkPreviewCard({ meta }: Props) {
  if (!meta.og_title && !meta.og_description && !meta.og_image_url) {
    return null
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden max-w-xs">
      {meta.og_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.og_image_url}
          alt={meta.og_title || 'Preview image'}
          className="w-full h-36 object-cover"
        />
      )}
      <div className="px-3 py-2">
        {meta.og_title && (
          <p className="text-sm font-medium text-gray-900 truncate">{meta.og_title}</p>
        )}
        {meta.og_description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{meta.og_description}</p>
        )}
      </div>
    </div>
  )
}
