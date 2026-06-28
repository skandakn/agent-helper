import Head from "next/head";
import EventForm from "../components/EventForm";

export default function CreateEventPage() {
  return (
    <>
      <Head>
        <title>New Launch · Launch Control</title>
      </Head>
      <EventForm />
    </>
  );
}
