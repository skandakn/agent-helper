export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/sign-up",
      permanent: false,
    },
  };
}

export default function SignupAlias() {
  return null;
}

SignupAlias.authPage = true;
SignupAlias.publicPage = true;
