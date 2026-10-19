import { Link, useLocation } from "react-router-dom";
import type { CardSummary } from "../../lib/tcgdex/types";
import { useFavourites } from "../favourites/useFavourites";
import { CardArtwork } from "./CardArtwork";
import { useLanguage } from "../../lib/tcgdex/useLanguage";

export function FavouriteButton({
  cardId,
  name,
}: {
  cardId: string;
  name: string;
}) {
  const favourites = useFavourites();
  const saved = favourites.contains(cardId);
  return (
    <button
      className={`favourite-button${saved ? " is-saved" : ""}`}
      type="button"
      aria-label={`${saved ? "Remove" : "Add"} ${name} ${saved ? "from" : "to"} favourites`}
      aria-pressed={saved}
      onClick={() => favourites.toggle(cardId)}
    >
      <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
    </button>
  );
}

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
        <FavouriteButton cardId={card.id} name={card.name} />
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
