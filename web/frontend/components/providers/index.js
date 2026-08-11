// react-query's provider used to be re-exported here. Nothing in the app ever
// called useQuery or useMutation, so it was ~40KB of the entry bundle spent on
// wrapping the tree in a client nobody read from.
export { PolarisProvider } from "./PolarisProvider";
