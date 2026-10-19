import { Link, useLocation } from "react-router-dom";
import type { CardSummary } from "../../lib/tcgdex/types";
import { CardArtwork } from "./CardArtwork";
import { useLanguage } from "../../lib/tcgdex/useLanguage";

export function CardTile({
  card,
  returnTo: suppliedReturnTo,
}: {
  card: CardSummary;
  returnTo?: string | undefined;
}) {
  const location = useLocation();
  const { language } = useLanguage();
  const returnTo = suppliedReturnTo ?? `${location.pathname}${location.search}`;
  const detailHref = `/cards/${encodeURIComponent(card.id)}?lang=${language}`;

  return (
    <article className="card-tile">
      <div className="card-tile__art">
        <Link
          className="card-tile__art-link"
          to={detailHref}
          state={{ returnTo }}
          aria-label={`View ${card.name}`}
        >
          <CardArtwork
            image={card.image}
            fallbackImage={card.fallbackImage}
            name={card.name}
          />
        </Link>
      </div>
      <div className="card-tile__meta">
        <div className="card-tile__heading">
          <Link
            to={detailHref}
            state={{ returnTo }}
            className="card-tile__name"
          >
            {card.name}
          </Link>
          <span className="card-tile__number">{card.localId}</span>
        </div>
        {card.setName && <p>{card.setName}</p>}
      </div>
    </article>
  );
}

export function CardGrid({
  cards,
  returnTo,
}: {
  cards: CardSummary[];
  returnTo?: string;
}) {
  return (
    <div className="card-grid">
      {cards.map((card) => (
        <CardTile key={card.id} card={card} returnTo={returnTo} />
      ))}
    </div>
  );
}
