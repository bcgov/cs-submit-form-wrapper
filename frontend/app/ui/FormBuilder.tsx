'use client'

import { useDictionary } from '../[lang]/Providers'
import './formio.css'
import dynamic from 'next/dynamic'
import { useKeycloak } from '@/lib/useKeycloak';

//dynamic as it requires document to be available
const FormioBuilder = dynamic(
  () => import('@formio/react').then((mod) => mod.FormBuilder ?? (mod as any).default?.FormBuilder),
  { ssr: false }
)

const FormioProvider = dynamic(
  () => import('@formio/react').then((mod) => mod.FormioProvider ?? (mod as any).default?.FormioProvider),
  { ssr: false }
)

function FormBuilder() {
  const dict = useDictionary();
  const { authenticated } = useKeycloak();
  const opt = {
    language: dict.locale,
    i18n: {
      [dict.locale]: dict
    },
    builder: {
      premium: false
    }
  }
  return (
    <>
      {authenticated ?
        (
          <FormioProvider baseUrl={process.env.NEXT_PUBLIC_FORMIO_BASE_URL} projectUrl={process.env.NEXT_PUBLIC_FORMIO_BASE_URL}>
            <FormioBuilder options={opt} />
          </FormioProvider>
        )
        :
        (
          <div>{dict.general.notAuthenticated}</div>
        )
      }
    </>
  )
}

export default FormBuilder;
export { FormBuilder };