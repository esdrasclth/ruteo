import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CATEGORIAS, esDelTenant } from '../../storage/claves';
import { StorageService, SubidaFirmada } from '../../storage/storage.service';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UploadUrlDto } from './dto/upload-url.dto';

/**
 * Reparte permisos de subida y anota lo que se subió.
 *
 * El backend no toca los binarios: firma una URL y el navegador sube directo.
 * Por eso lo único que se puede controlar es A QUIÉN se le firma y PARA QUÉ, y
 * hay que hacerlo bien aquí, porque después de entregar la URL ya no hay dónde
 * comprobar nada.
 *
 * Dos capas de aislamiento:
 *
 *  1. El RLS acota la consulta del propietario a la empresa de quien pide, así
 *     que un `propietarioId` de otra empresa simplemente no existe desde aquí.
 *  2. La clave se compone con el `tenantId` de la sesión —nunca con algo que
 *     venga en el cuerpo—, así que ni firmando de más se puede escribir en la
 *     carpeta de otro.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async urlDeSubida(
    tenantId: string,
    dto: UploadUrlDto,
  ): Promise<SubidaFirmada> {
    await this.comprobarPropietario(tenantId, dto);

    return this.storage.firmarSubida({
      tenantId,
      categoria: dto.categoria,
      propietarioId: dto.propietarioId,
      nombreOriginal: dto.nombreOriginal,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
    });
  }

  /**
   * Confirma que el archivo llegó y crea su fila.
   *
   * El tamaño y el tipo se leen del ALMACENAMIENTO, no de lo que diga quien
   * llama: son los del objeto que existe de verdad. Copiarlos del cuerpo de la
   * petición dejaría una fila que dice «2 MB, image/jpeg» sobre un objeto que
   * puede ser otra cosa, y esa fila es la que se enseñaría en un reclamo.
   *
   * Es idempotente: reintentar la confirmación —red inestable, doble clic—
   * devuelve la misma fila en vez de duplicarla. Por eso `key` es único.
   */
  async confirmar(
    tenantId: string,
    userId: string | undefined,
    dto: ConfirmUploadDto,
  ) {
    if (!esDelTenant(dto.clave, tenantId)) {
      throw new BadRequestException('El archivo no pertenece a esta empresa');
    }

    const objeto = await this.storage.comprobar(dto.clave, tenantId);
    if (!objeto) {
      throw new BadRequestException(
        'La subida no se completó. Vuelve a intentarlo.',
      );
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      const existente = await tx.fileObject.findUnique({
        where: { key: dto.clave },
      });
      if (existente) return existente;

      return tx.fileObject.create({
        data: {
          tenantId,
          key: dto.clave,
          contentType: objeto.contentType,
          sizeBytes: objeto.sizeBytes,
          originalName: dto.nombreOriginal,
          uploadedByUserId: userId,
        },
      });
    });
  }

  /** URL firmada para ver un archivo ya registrado. */
  async urlDeDescarga(tenantId: string, fileId: string): Promise<string> {
    const archivo = await this.prisma.withTenant(tenantId, (tx) =>
      tx.fileObject.findUnique({
        where: { id: fileId },
        select: { key: true },
      }),
    );
    if (!archivo) {
      throw new NotFoundException('El archivo no existe');
    }
    return this.storage.firmarDescarga(archivo.key, tenantId);
  }

  /**
   * ¿Existe la cosa a la que se quiere adjuntar el archivo?
   *
   * Sin esto, el bucket se llena de carpetas con identificadores inventados que
   * nada referencia y que nadie va a borrar nunca, porque no hay fila desde la
   * que llegar a ellas.
   */
  private async comprobarPropietario(
    tenantId: string,
    dto: UploadUrlDto,
  ): Promise<void> {
    const existe = await this.prisma.withTenant(tenantId, async (tx) => {
      switch (dto.categoria) {
        case CATEGORIAS.PRUEBA_ENTREGA:
          return tx.routeStop.findUnique({
            where: { id: dto.propietarioId },
            select: { id: true },
          });
        // Fotos del bulto y factura de compra cuelgan las dos del paquete: la
        // foto la toma la bodega al recibir, la factura la trae el cliente con
        // la prealerta.
        case CATEGORIAS.FOTOS_PAQUETE:
        case CATEGORIAS.DOCUMENTOS:
          return tx.lockerPackage.findUnique({
            where: { id: dto.propietarioId },
            select: { id: true },
          });
        default:
          return null;
      }
    });

    if (!existe) {
      throw new NotFoundException(
        'No existe aquello a lo que quieres adjuntar el archivo',
      );
    }
  }
}
