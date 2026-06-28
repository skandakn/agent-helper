import Head from "next/head";
import AgentMonitor from "../components/AgentMonitor";

export default function AgentMonitorPage() {
  return (
    <>
      <Head>
        <title>Agent Monitor · Launch Control</title>
      </Head>
      <AgentMonitor />
    </>
  );
}
