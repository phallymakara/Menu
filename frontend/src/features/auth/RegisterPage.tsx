import type { FC } from 'react'
import { Navigate } from 'react-router-dom'

export const RegisterPage: FC = () => {
  return <Navigate to="/?register=true" replace />
}
