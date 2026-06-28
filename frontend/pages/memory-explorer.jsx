import Head from "next/head";
import MemoryExplorer from "../components/MemoryExplorer";

export default function MemoryExplorerPage() {
  return (
    <>
      <Head>
        <title>Memory Explorer · Launch Control</title>
      </Head>
      <MemoryExplorer />
    </>
  );
}
