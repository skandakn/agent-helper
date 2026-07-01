import Head from "next/head";
import MessageGenerator from "../components/MessageGenerator";

export default function MessageGeneratorPage() {
  return (
    <>
      <Head>
        <title>Message Generator - Launch Control</title>
      </Head>
      <MessageGenerator />
    </>
  );
}
