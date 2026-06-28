import Head from "next/head";
import Settings from "../components/Settings";

export default function SettingsPage() {
  return (
    <>
      <Head>
        <title>Settings · Launch Control</title>
      </Head>
      <Settings />
    </>
  );
}
