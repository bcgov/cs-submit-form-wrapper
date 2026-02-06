'use client'

import { useDictionary } from '../[lang]/Providers'
import './formio.css'
import dynamic from 'next/dynamic'
import { useKeycloak } from '@/lib/useKeycloak';

//dynamic as it requires document to be available
const FormioGrid = dynamic(
  () => import('@formio/react').then((mod) => mod.FormGrid ?? (mod as any).default?.FormGrid),
  { ssr: false }
)

const FormioProvider = dynamic(
  () => import('@formio/react').then((mod) => mod.FormioProvider ?? (mod as any).default?.FormioProvider),
  { ssr: false }
)

function FormList() {
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
            <FormioGrid options={opt} />
          </FormioProvider>
        ) :
        (
          <div>{dict.general.notAuthenticated}</div>
        )
      }
    </>
  )
}

export default FormList;
export { FormList };