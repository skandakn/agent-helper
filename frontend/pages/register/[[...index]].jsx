export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/sign-up",
      permanent: false,
    },
  };
}

export default function RegisterAlias() {
  return null;
}

RegisterAlias.authPage = true;
RegisterAlias.publicPage = true;
