import Head from "next/head";
import Dashboard from "../components/Dashboard";

export default function DashboardPage() {
  return (
    <>
      <Head>
        <title>Dashboard · Launch Control</title>
      </Head>
      <Dashboard />
    </>
  );
}
