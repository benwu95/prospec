export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

export interface Pricing {
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  cache_read_multiplier: number;
  cache_write_multiplier: number;
}
