export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/sign-in",
      permanent: false,
    },
  };
}

export default function LoginAlias() {
  return null;
}

LoginAlias.authPage = true;
LoginAlias.publicPage = true;
