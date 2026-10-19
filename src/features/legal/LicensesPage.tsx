import { PageFrame } from "../../components/AppLayout";
import { PageHeading } from "../../components/States";

export function LicensesPage() {
  return (
    <PageFrame className="license-page">
      <PageHeading eyebrow="About Card Atlas" title="Licenses & data sources" />
      <p className="license-page__intro">
        Card Atlas uses third-party card data, artwork references, and market
        prices. Their attribution and licensing information is collected here.
      </p>

      <section className="license-card" aria-labelledby="license-tcgdex">
        <p className="eyebrow">Card catalogue and simulator</p>
        <h2 id="license-tcgdex">TCGdex</h2>
        <p>
          Card and set data, localized names, rarity information, and artwork
          references are provided by TCGdex. TCGdex states that its database is
          MIT-licensed; the MIT notice and license text are included in the
          third-party notices.
        </p>
        <p>
          TCGdex is an independent project and is not affiliated with Nintendo
          or The Pokémon Company. Pokémon names, logos, card designs, and images
          belong to their respective rights holders.
        </p>
        <p className="license-card__links">
          <a href="https://tcgdex.dev/" target="_blank" rel="noreferrer">
            TCGdex API
          </a>
          <a
            href="https://github.com/tcgdex/cards-database/blob/master/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            Database and license
          </a>
          <a
            href="https://github.com/tcgdex/javascript-sdk/blob/master/LICENSE.md"
            target="_blank"
            rel="noreferrer"
          >
            TypeScript SDK
          </a>
        </p>
      </section>

      <section className="license-card" aria-labelledby="license-prices">
        <p className="eyebrow">Market data</p>
        <h2 id="license-prices">Pokémon API / TCGGO</h2>
        <p>
          Cardmarket and TCGplayer pricing is requested through the provider’s
          RapidAPI service. Use of that API and its data is subject to the
          provider’s and RapidAPI’s terms and the account plan. The provider
          does not publish a separate open-source data license in the linked
          documentation.
        </p>
        <p className="license-card__links">
          <a
            href="https://www.pokemon-api.com/"
            target="_blank"
            rel="noreferrer"
          >
            Pokémon API
          </a>
          <a
            href="https://rapidapi.com/tcggopro/api/cardmarket-api-tcg"
            target="_blank"
            rel="noreferrer"
          >
            RapidAPI provider listing
          </a>
          <a
            href="https://rapidapi.com/page/terms"
            target="_blank"
            rel="noreferrer"
          >
            RapidAPI terms
          </a>
        </p>
      </section>

      <section className="license-card" aria-labelledby="license-apitcg">
        <p className="eyebrow">Optional provider-data explorer</p>
        <h2 id="license-apitcg">APITCG</h2>
        <p>
          The APITCG explorer and local catalogue sync use APITCG’s card,
          product, set, and price endpoints. Access is governed by your APITCG
          account and plan. Its public API documentation does not specify a
          separate open-source data license; contact APITCG for other licensing
          arrangements.
        </p>
        <p className="license-card__links">
          <a href="https://www.apitcg.com/" target="_blank" rel="noreferrer">
            APITCG
          </a>
          <a href="https://docs.apitcg.com/" target="_blank" rel="noreferrer">
            API documentation
          </a>
          <a href="mailto:support@apitcg.com">Contact APITCG</a>
        </p>
      </section>

      <p className="license-page__notice">
        Card Atlas is an unofficial fan project and is not affiliated with
        Nintendo, Creatures Inc., GAME FREAK, or The Pokémon Company. Market
        prices are provider data and may change.
      </p>
      <a
        className="license-page__full-notice"
        href="/THIRD_PARTY_NOTICES.md"
        target="_blank"
        rel="noreferrer"
      >
        Read the full third-party notices and MIT license
      </a>
    </PageFrame>
  );
}
