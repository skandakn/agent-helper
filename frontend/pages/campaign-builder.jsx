import Head from "next/head";
import CampaignBuilder from "../components/CampaignBuilder";

export default function CampaignBuilderPage() {
  return (
    <>
      <Head>
        <title>Campaign Builder · Launch Control</title>
      </Head>
      <CampaignBuilder />
    </>
  );
}
