import "../styles/globals.css";
import { EventProvider } from "../store/event";
import { LanguageProvider } from "../lib/i18n/context";
import Layout from "../components/Layout";

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <EventProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </EventProvider>
    </LanguageProvider>
  );
}
