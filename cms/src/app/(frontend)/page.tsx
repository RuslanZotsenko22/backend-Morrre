export const runtime = 'nodejs'

import { headers as getHeaders } from 'next/headers'
import Image from 'next/image'
import { getPayload } from 'payload'
import React from 'react'
import { fileURLToPath } from 'url'

import config from '@payload-config'
import './styles.css'

export default async function HomePage() {
  const headers = await getHeaders()
  const payload = await getPayload({
    config: await config, // секрет уже в конфізі
  })

  const { user } = await payload.auth({ headers })
  const fileURL = `vscode://file/${fileURLToPath(import.meta.url)}`

  return (
    <div className="home">
      <div className="content">
        <picture>
          <source srcSet="https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/assets/payload-favicon.svg" />
          <Image
            alt="Payload Logo"
            height={65}
            src="https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/assets/payload-favicon.svg"
            width={65}
          />
        </picture>
        {!user && <h1>Welcome to your Morrre </h1>}
        {user && <h1>Welcome back, {user.email}</h1>}
        <div className="links">
          <a className="admin" href={(await config).routes.admin} target="_blank" rel="noopener noreferrer">
            Go to admin panel
          </a>
          <a className="docs" href="https://payloadcms.com/docs" target="_blank" rel="noopener noreferrer">
            Documentation
          </a>
        </div>
      </div>
      <div className="footer">
        <p>Update this page by editing</p>
        <a className="codeLink" href={fileURL}>
          <code>app/(frontend)/page.tsx</code>
        </a>
      </div>
    </div>
  )
}
