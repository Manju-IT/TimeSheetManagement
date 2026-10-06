interface Props {
    latitude: number;
    longitude: number;
    accuracyM?: number | null;
    label?: string | null;
    size?: number;
}

/**
 * Lightweight single-tile OSM preview. No mapping library.
 * Fails gracefully if tile.openstreetmap.org is unreachable.
 */
export function MiniMap({ latitude, longitude, accuracyM, label, size = 120 }: Props) {
    const zoom = 16;
    const n = Math.pow(2, zoom);
    const xTile = Math.floor(((longitude + 180) / 360) * n);
    const latRad = (latitude * Math.PI) / 180;
    const yTile = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    const url = `https://tile.openstreetmap.org/${zoom}/${xTile}/${yTile}.png`;

    return (
        <div className="mini-map" style={{ width: size, height: size }}>
            <img
                src={url}
                alt=""
                width={size}
                height={size}
                loading="lazy"
                referrerPolicy="no-referrer"
            />
            <div className="mini-map-pin" />
            <div className="mini-map-tooltip">
                {label ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                {accuracyM != null && <> · ±{Math.round(accuracyM)}m</>}
                <a
                    href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                >
                    {' '}open ↗
                </a>
            </div>
        </div>
    );
}