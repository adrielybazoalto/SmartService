export interface Client {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  created_at: string
}

export type CreateClientInput = Omit<Client, 'id' | 'created_at'>