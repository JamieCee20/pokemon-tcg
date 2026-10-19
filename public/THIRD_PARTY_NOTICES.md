# Third-party data, API and licensing notices

Cee’s Card Vault uses the services and data sources below. This notice describes those third-party sources; it does not grant rights to Pokémon intellectual property or set a license for Cee’s Card Vault source code.

## TCGdex card and set database

Cee’s Card Vault uses TCGdex for Pokémon TCG card and set data, localized names, rarity information, and card artwork URLs. The TCGdex cards database repository states that its database is licensed under the MIT License. TCGdex's JavaScript/TypeScript SDK (`@tcgdex/sdk`) is also MIT-licensed.

- Website and API: <https://tcgdex.dev/> and <https://api.tcgdex.net/>
- Database repository: <https://github.com/tcgdex/cards-database>
- Database MIT license: <https://github.com/tcgdex/cards-database/blob/master/LICENSE>
- SDK repository and license: <https://github.com/tcgdex/javascript-sdk/blob/master/LICENSE.md>

The TCGdex project states that its database is not produced, endorsed, supported, or affiliated with Nintendo or The Pokémon Company. Pokémon names, logos, card designs, and card images remain the property of their respective rights holders; the database license should not be read as a separate license from those rights holders.

### MIT License

Copyright (c) 2021 TCGdex

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Pokémon pricing API

Market prices are requested from the Pokémon API service through its RapidAPI-hosted CardMarket API TCG provider. API access and any reuse or redistribution of provider data are subject to the applicable provider and RapidAPI terms and the account plan in use. The service documentation does not identify a separate open-source license for its pricing data.

- Service: <https://www.pokemon-api.com/>
- RapidAPI provider listing: <https://rapidapi.com/tcggopro/api/cardmarket-api-tcg>
- API documentation: <https://www.tcggo.com/api-docs/v1/>
- RapidAPI terms: <https://rapidapi.com/page/terms>

## APITCG

The optional APITCG explorer and catalogue sync use <https://www.apitcg.com/> and its API at <https://api.apitcg.com/>. API keys, quotas, and service access are governed by the account and plan terms provided by APITCG. The public API documentation does not identify a separate open-source license for the API's card, product, or price data; contact <support@apitcg.com> for licensing questions.

- Website: <https://www.apitcg.com/>
- API documentation: <https://docs.apitcg.com/>

## Cee’s Card Vault source code

This repository does not currently declare a license for Cee’s Card Vault source code. The third-party licenses above apply only to the corresponding third-party components and data; they do not license Cee’s Card Vault source code.
