import type { ProfileSnapshot } from '../domain/profile'

const storeName = 'profiles'
const databaseVersion = 1

export interface ProfileRepository {
  listAll(): Promise<ProfileSnapshot[]>
  save(profile: ProfileSnapshot): Promise<void>
  clearAll(): Promise<void>
}

type TransactionAction = (store: IDBObjectStore, setResult: (result: ProfileSnapshot[]) => void) => void

function transactionError(transaction: IDBTransaction): Error {
  return transaction.error ?? new Error('The browser storage transaction did not complete')
}

function runTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: TransactionAction,
): Promise<ProfileSnapshot[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    let result: ProfileSnapshot[] = []

    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transactionError(transaction))
    transaction.onabort = () => reject(transactionError(transaction))

    try {
      action(transaction.objectStore(storeName), (value) => { result = value })
    } catch (error) {
      transaction.abort()
      reject(error)
    }
  })
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not provide IndexedDB'))

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains(storeName)) return
      const store = database.createObjectStore(storeName, { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser history'))
    request.onblocked = () => reject(new Error('Browser history is blocked by another open page'))
  })
}

export class IndexedDbProfileRepository implements ProfileRepository {
  readonly #databaseName: string
  #databasePromise?: Promise<IDBDatabase>

  constructor(databaseName = 'privacy-profile-generator') {
    this.#databaseName = databaseName
  }

  async listAll(): Promise<ProfileSnapshot[]> {
    const database = await this.database()
    const records = await runTransaction(database, 'readonly', (store, setResult) => {
      const request = store.index('createdAt').openCursor(null, 'prev')
      const profiles: ProfileSnapshot[] = []
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          setResult(profiles)
          return
        }
        profiles.push(cursor.value as ProfileSnapshot)
        cursor.continue()
      }
    })

    return records
  }

  async save(profile: ProfileSnapshot): Promise<void> {
    const database = await this.database()
    await runTransaction(database, 'readwrite', (store) => {
      store.put(profile)
    })
  }

  async clearAll(): Promise<void> {
    const database = await this.database()
    await runTransaction(database, 'readwrite', (store) => {
      store.clear()
    })
  }

  private database(): Promise<IDBDatabase> {
    this.#databasePromise ??= openDatabase(this.#databaseName).catch((error: unknown) => {
      this.#databasePromise = undefined
      throw error
    })
    return this.#databasePromise
  }
}
