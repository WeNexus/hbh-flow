export interface IterateCliqDbOptions<T> {
  connection: string;
  db: string;
  criteria?: string;
  callback: (item: T) => Promise<void> | void;
}
